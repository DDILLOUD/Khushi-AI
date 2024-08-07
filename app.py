import os
import secrets
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, session, send_file
from werkzeug.utils import secure_filename
import google.generativeai as genai
import uuid
from flask_cors import CORS

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
if os.environ.get('FLASK_ENV') == 'production':
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
    if not app.config['SECRET_KEY']:
        raise ValueError("No SECRET_KEY set for production environment")
else:
    # Generate a random secret key for development
    app.config['SECRET_KEY'] = secrets.token_hex(16)

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Configure Google Generative AI
google_api_key = os.getenv('GOOGLE_API_KEY')
if not google_api_key:
    raise ValueError("No GOOGLE_API_KEY found in environment variables")
genai.configure(api_key=google_api_key)

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/gpt', methods=['POST'])
def gpt():
    query = request.json.get('query')
    if not query:
        return jsonify({'error': 'No query provided'}), 400

    try:
        model = genai.GenerativeModel('gemini-pro')
        prompt = f"As an AI assistant specialized in Indian law, please provide a response to the following query: {query}"
        response = model.generate_content(prompt)
        return jsonify({'response': response.text})
    except Exception as e:
        app.logger.error(f"Error in GPT route: {str(e)}")
        return jsonify({'error': 'An error occurred while processing your request'}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{uuid.uuid4()}_{filename}")
        file.save(filepath)
        session['current_file'] = filepath
        return jsonify({'success': True, 'filename': filename})
    return jsonify({'error': 'File type not allowed'}), 400

@app.route('/get_pdf', methods=['GET'])
def get_pdf():
    filepath = session.get('current_file')
    if not filepath or not os.path.exists(filepath):
        return jsonify({'error': 'No file uploaded'}), 404
    return send_file(filepath, mimetype='application/pdf')

@app.route('/save_annotation', methods=['POST'])
def save_annotation():
    data = request.json
    annotations = data.get('annotations', [])
    # In a real application, you would save this to a database
    # For now, we'll just log it
    app.logger.info(f"Saved annotations: {annotations}")
    return jsonify({'success': True})

# Helper function
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'pdf'}

# Error handlers
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f"Internal error: {str(error)}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
