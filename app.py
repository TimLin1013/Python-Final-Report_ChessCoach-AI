from flask import Flask, render_template, request, jsonify, session
import chess
import chess.engine
import uuid
import os
import sqlite3
import json
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'chess_secret_key_2024'

games = {}

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR       = os.path.dirname(__file__)
STOCKFISH_PATH = os.path.join(BASE_DIR, 'stockfish.exe')
if not os.path.isfile(STOCKFISH_PATH):
    STOCKFISH_PATH = None

DB_PATH = os.path.join(BASE_DIR, 'chess.db')

# ── Database ───────────────────────────────────────────────────────────────
def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with get_db() as db:
        db.execute('''
            CREATE TABLE IF NOT EXISTS saved_games (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT    NOT NULL,
                mode      TEXT    NOT NULL DEFAULT 'pvp',
                pgn       TEXT    NOT NULL,
                fen       TEXT    NOT NULL,
                move_count INTEGER NOT NULL DEFAULT 0,
                result    TEXT,
                saved_at  TEXT    NOT NULL
            )
        ''')
        db.commit()

init_db()

# ── Helpers ────────────────────────────────────────────────────────────────
def board_to_dict(board):
    pieces = {}
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            col = chess.square_file(square)
            row = 7 - chess.square_rank(square)
            pieces[f"{row},{col}"] = {
                'type':   piece.piece_type,
                'color':  'white' if piece.color == chess.WHITE else 'black',
                'symbol': piece.symbol()
            }
    return pieces

def get_legal_moves_list(board, square_idx):
    square = chess.Square(square_idx)
    return [
        {'row': 7 - chess.square_rank(m.to_square), 'col': chess.square_file(m.to_square)}
        for m in board.legal_moves if m.from_square == square
    ]

def game_status(board):
    if board.is_checkmate():
        return 'checkmate', 'white' if board.turn == chess.BLACK else 'black'
    if board.is_stalemate():             return 'stalemate', None
    if board.is_insufficient_material(): return 'draw',      None
    if board.is_check():                 return 'check',     None
    return 'playing', None

def board_to_pgn(board):
    """Export current board move history as PGN moves string."""
    tmp = chess.Board()
    moves = []
    for i, move in enumerate(board.move_stack):
        if i % 2 == 0:
            moves.append(f"{i//2 + 1}.")
        moves.append(tmp.san(move))
        tmp.push(move)
    return ' '.join(moves)

def pgn_to_board(pgn):
    """Reconstruct board from PGN moves string."""
    board = chess.Board()
    if not pgn.strip():
        return board
    tokens = pgn.split()
    for token in tokens:
        if '.' in token:
            continue
        try:
            board.push_san(token)
        except Exception:
            break
    return board

# ── Routes ─────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/new_game', methods=['POST'])
def new_game():
    game_id = str(uuid.uuid4())
    games[game_id] = chess.Board()
    session['game_id'] = game_id
    return jsonify({'game_id': game_id, 'pieces': board_to_dict(games[game_id]),
                    'turn': 'white', 'status': 'playing'})

@app.route('/api/get_moves', methods=['POST'])
def get_moves():
    data    = request.json
    game_id = session.get('game_id') or data.get('game_id')
    board   = games.get(game_id)
    if not board: return jsonify({'error': 'Game not found'}), 404
    sq = chess.square(data['col'], 7 - data['row'])
    return jsonify({'moves': get_legal_moves_list(board, sq)})

@app.route('/api/move', methods=['POST'])
def make_move():
    data    = request.json
    game_id = session.get('game_id') or data.get('game_id')
    board   = games.get(game_id)
    if not board: return jsonify({'error': 'Game not found'}), 404

    fr, fc  = data['from_row'], data['from_col']
    tr, tc  = data['to_row'],   data['to_col']
    from_sq = chess.square(fc, 7 - fr)
    to_sq   = chess.square(tc, 7 - tr)

    promotion = None
    piece = board.piece_at(from_sq)
    if piece and piece.piece_type == chess.PAWN:
        if (piece.color == chess.WHITE and tr == 0) or (piece.color == chess.BLACK and tr == 7):
            promo_map = {'q': chess.QUEEN, 'r': chess.ROOK, 'b': chess.BISHOP, 'n': chess.KNIGHT}
            promotion = promo_map.get(data.get('promotion', 'q').lower(), chess.QUEEN)

    move = chess.Move(from_sq, to_sq, promotion=promotion)
    if move not in board.legal_moves:
        return jsonify({'error': 'Illegal move'}), 400

    captured = board.piece_at(to_sq)
    board.push(move)
    status, winner = game_status(board)

    return jsonify({
        'pieces':   board_to_dict(board),
        'turn':     'white' if board.turn == chess.WHITE else 'black',
        'status':   status,
        'winner':   winner,
        'captured': captured.symbol() if captured else None,
        'in_check': board.is_check(),
        'fen':      board.fen(),
    })

@app.route('/api/undo', methods=['POST'])
def undo_move():
    game_id = session.get('game_id')
    board   = games.get(game_id)
    if not board:                 return jsonify({'error': 'Game not found'}), 404
    if not len(board.move_stack): return jsonify({'error': 'No moves to undo'}), 400

    board.pop()
    status, winner = game_status(board)

    last_move = None
    if board.move_stack:
        lm = board.peek()
        last_move = {
            'fromRow': 7 - chess.square_rank(lm.from_square),
            'fromCol': chess.square_file(lm.from_square),
            'toRow':   7 - chess.square_rank(lm.to_square),
            'toCol':   chess.square_file(lm.to_square)
        }

    return jsonify({
        'pieces':    board_to_dict(board),
        'turn':      'white' if board.turn == chess.WHITE else 'black',
        'status':    status,
        'winner':    winner,
        'in_check':  board.is_check(),
        'fen':       board.fen(),
        'last_move': last_move
    })

@app.route('/api/reset', methods=['POST'])
def reset_game():
    game_id = session.get('game_id')
    if not game_id or game_id not in games:
        return jsonify({'error': 'No game found'}), 404
    games[game_id] = chess.Board()
    return jsonify({'pieces': board_to_dict(games[game_id]), 'turn': 'white', 'status': 'playing'})

# ── Save / Load ────────────────────────────────────────────────────────────
@app.route('/api/save_game', methods=['POST'])
def save_game():
    data    = request.json
    game_id = session.get('game_id') or data.get('game_id')
    board   = games.get(game_id)
    if not board: return jsonify({'error': 'Game not found'}), 404

    name       = data.get('name', '').strip() or f"棋局 {datetime.now().strftime('%m/%d %H:%M')}"
    mode       = data.get('mode', 'pvp')
    pgn        = board_to_pgn(board)
    fen        = board.fen()
    move_count = len(board.move_stack)
    status, winner = game_status(board)
    result     = winner or status   # 'white'/'black'/'stalemate'/'draw'/'playing'
    saved_at   = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    with get_db() as db:
        cursor = db.execute(
            'INSERT INTO saved_games (name, mode, pgn, fen, move_count, result, saved_at) VALUES (?,?,?,?,?,?,?)',
            (name, mode, pgn, fen, move_count, result, saved_at)
        )
        db.commit()
        row_id = cursor.lastrowid

    return jsonify({'id': row_id, 'name': name, 'saved_at': saved_at})

@app.route('/api/list_games', methods=['GET'])
def list_games():
    with get_db() as db:
        rows = db.execute(
            'SELECT id, name, mode, move_count, result, saved_at FROM saved_games ORDER BY saved_at DESC'
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/load_game/<int:game_id>', methods=['POST'])
def load_game(game_id):
    with get_db() as db:
        row = db.execute('SELECT * FROM saved_games WHERE id=?', (game_id,)).fetchone()
    if not row: return jsonify({'error': 'Saved game not found'}), 404

    board = pgn_to_board(row['pgn'])

    new_id = str(uuid.uuid4())
    games[new_id] = board
    session['game_id'] = new_id

    # Rebuild last move highlight
    last_move = None
    if board.move_stack:
        lm = board.peek()
        last_move = {
            'fromRow': 7 - chess.square_rank(lm.from_square),
            'fromCol': chess.square_file(lm.from_square),
            'toRow':   7 - chess.square_rank(lm.to_square),
            'toCol':   chess.square_file(lm.to_square)
        }

    status, winner = game_status(board)
    return jsonify({
        'game_id':    new_id,
        'pieces':     board_to_dict(board),
        'turn':       'white' if board.turn == chess.WHITE else 'black',
        'status':     status,
        'winner':     winner,
        'fen':        board.fen(),
        'pgn':        row['pgn'],
        'mode':       row['mode'],
        'name':       row['name'],
        'move_count': row['move_count'],
        'last_move':  last_move
    })

@app.route('/api/delete_game/<int:game_id>', methods=['DELETE'])
def delete_game(game_id):
    with get_db() as db:
        db.execute('DELETE FROM saved_games WHERE id=?', (game_id,))
        db.commit()
    return jsonify({'ok': True})

# ── Stockfish ──────────────────────────────────────────────────────────────
@app.route('/api/stockfish', methods=['POST'])
def stockfish_move():
    if not STOCKFISH_PATH:
        return jsonify({'error': 'Stockfish not found'}), 503

    data    = request.json
    game_id = session.get('game_id') or data.get('game_id')
    board   = games.get(game_id)
    if not board:            return jsonify({'error': 'Game not found'}), 404
    if board.is_game_over(): return jsonify({'error': 'Game over'}), 400

    depth = int(data.get('depth', 12))
    try:
        with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
            result = engine.play(board, chess.engine.Limit(depth=depth))
            move   = result.move
            info   = engine.analyse(board, chess.engine.Limit(depth=depth))
            score  = info['score'].white()
            eval_str = f"M{score.mate()}" if score.is_mate() else (
                f"{score.score()/100:+.2f}" if score.score() is not None else "?")
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    fr = 7 - chess.square_rank(move.from_square)
    fc = chess.square_file(move.from_square)
    tr = 7 - chess.square_rank(move.to_square)
    tc = chess.square_file(move.to_square)

    captured = board.piece_at(move.to_square)
    board.push(move)
    status, winner = game_status(board)

    files, ranks = 'abcdefgh', '87654321'
    return jsonify({
        'pieces':     board_to_dict(board),
        'turn':       'white' if board.turn == chess.WHITE else 'black',
        'status':     status,
        'winner':     winner,
        'captured':   captured.symbol() if captured else None,
        'in_check':   board.is_check(),
        'fen':        board.fen(),
        'from_row': fr, 'from_col': fc,
        'to_row':   tr, 'to_col':   tc,
        'move_san':   f"{files[fc]}{ranks[fr]}{files[tc]}{ranks[tr]}",
        'evaluation': eval_str
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
