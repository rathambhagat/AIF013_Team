# 🌿 Sylva --- AI-Powered Document Intelligence Assistant

> Upload your documents, ask questions in natural language, and get
> answers grounded in retrieved passages with source references.

Sylva is a Django-based web application that helps users find
information in lengthy PDF and TXT documents. It combines document
processing, Retrieval-Augmented Generation (RAG), vector similarity
search, and a conversational interface to make document research faster
and easier.

## ✨ Features

-   **PDF and TXT uploads** --- add documents to your workspace.
-   **Document text extraction** --- extract text from supported
    documents.
-   **Text chunking** --- split long documents into smaller, overlapping
    sections while preserving page information.
-   **Semantic retrieval** --- use embeddings and FAISS to retrieve
    relevant passages.
-   **AI-generated answers** --- use the Gemini API to generate
    responses based on retrieved context.
-   **Source references** --- view document names, page numbers, and
    supporting passages.
-   **Grounded responses** --- when relevant information cannot be
    found, the app can return a not-found response rather than
    intentionally guessing.
-   **Interactive workspace** --- browse documents, ask questions, and
    view answers in a responsive interface.
-   **Offline demo mode** --- run a limited lexical-retrieval demo
    without a Gemini API key.

## 🧰 Tech Stack

  Area                       Technology
  -------------------------- ----------------------------------
  Frontend                   HTML, CSS, Bootstrap, JavaScript
  Landing-page visuals       Three.js
  Backend                    Python, Django
  PDF extraction             pypdf
  Embeddings and AI          Google Gemini API
  Vector similarity search   FAISS, NumPy
  Configuration              python-dotenv
  Static files               WhiteNoise

## 🏗️ How It Works

1.  **Upload:** The user uploads a PDF or TXT file.
2.  **Extract:** Sylva extracts the document text and keeps page
    information where available.
3.  **Chunk:** The extracted text is divided into smaller overlapping
    chunks.
4.  **Embed and index:** The chunks are converted into vector
    representations and indexed for similarity search.
5.  **Retrieve:** When a user asks a question, Sylva searches for
    relevant passages.
6.  **Generate:** With Gemini configured, the retrieved passages are
    supplied as context for answer generation.
7.  **Cite:** The interface displays the answer with supporting source
    references.

``` text
PDF / TXT
   ↓
Text Extraction
   ↓
Chunking
   ↓
Embeddings + FAISS Index
   ↓
Relevant Passage Retrieval
   ↓
Gemini Answer Generation
   ↓
Answer + Source References
```

## 📁 Project Structure

``` text
sylva/
├── config/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
├── docs/
│   ├── migrations/
│   ├── services/
│   │   ├── extract.py
│   │   ├── chunking.py
│   │   ├── embeddings.py
│   │   ├── vectorstore.py
│   │   ├── llm.py
│   │   └── pipeline.py
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   └── tests.py
├── static/
│   ├── css/
│   ├── js/
│   ├── vendor/
│   └── sylva/
├── templates/
│   ├── landing.html
│   └── workspace.html
├── .env.example
├── manage.py
├── requirements.txt
└── README.md
```

## 🚀 Getting Started

### Prerequisites

-   Python 3.10 or newer recommended
-   pip
-   A Google Gemini API key for semantic retrieval and generated answers

### 1. Clone the repository

``` bash
git clone https://github.com/rathambhagat/AIF013_Team.git
cd AIF013_Team
```

If the repository folder has a different name, `cd` into the folder
containing `manage.py`.

### 2. Create and activate a virtual environment

**Windows PowerShell**

``` powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux**

``` bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

``` bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file in the project root by copying `.env.example`.

**Windows PowerShell**

``` powershell
Copy-Item .env.example .env
```

**macOS / Linux**

``` bash
cp .env.example .env
```

Open `.env` and add your Gemini API key:

``` env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
DJANGO_SECRET_KEY=replace_with_a_secure_secret_key
DJANGO_DEBUG=1
```

Get a Gemini API key from [Google AI
Studio](https://aistudio.google.com/apikey).

**Security:** Never commit your `.env` file or publish API keys and
secret keys in the repository.

### 5. Apply database migrations

``` bash
python manage.py migrate
```

### 6. Start the development server

``` bash
python manage.py runserver
```

Open <http://127.0.0.1:8000/> in your browser.

### 7. Run tests

``` bash
python manage.py test docs
```

## 🔑 Running Without a Gemini API Key

If `GEMINI_API_KEY` is not configured, Sylva can run in its documented
offline demo mode using lexical retrieval and extractive answers. This
mode is useful for demonstrating parts of the workflow, but it does
**not** provide the same semantic retrieval and Gemini-generated answers
as the configured mode.

## ⚙️ Configuration

The following environment variables can be used to configure the
application. Defaults depend on the project settings.

  Variable                   Purpose
  -------------------------- -------------------------------------------------
  `GEMINI_API_KEY`           API key used to access Gemini
  `GEMINI_MODEL`             Gemini text-generation model
  `GEMINI_EMBEDDING_MODEL`   Gemini embedding model
  `DJANGO_SECRET_KEY`        Django secret key
  `DJANGO_DEBUG`             Enables or disables Django debug mode
  `DJANGO_ALLOWED_HOSTS`     Hosts permitted by Django
  `CHUNK_SIZE`               Target size of each text chunk
  `CHUNK_OVERLAP`            Overlap between adjacent chunks
  `TOP_K`                    Number of candidate passages to retrieve
  `MIN_SCORE_GEMINI`         Minimum retrieval score used by the Gemini path
  `MAX_UPLOAD_MB`            Maximum permitted upload size

## 🧪 Testing and Demo Checklist

Before presenting or demonstrating Sylva:

-   [ ] Start the server and confirm that the landing page loads.
-   [ ] Upload a text-based PDF or TXT document.
-   [ ] Ask a question whose answer appears in the uploaded document.
-   [ ] Check that the answer includes source information.
-   [ ] Ask a question that the document does not answer and check the
    not-found behavior.
-   [ ] Confirm whether the application is running in Gemini mode or
    offline demo mode.

## ⚠️ Current Limitations

-   Scanned or image-only PDFs without an extractable text layer are not
    supported unless OCR is added.
-   Document indexing is synchronous, so very large files may take
    longer to process.
-   Answer quality depends on document quality, retrieval settings, and
    the language model.
-   Not-found handling reduces unsupported answers but cannot guarantee
    that every response is correct.

## 🔒 Production Notes

Before deploying publicly:

-   Set `DJANGO_DEBUG=0`.
-   Use a strong, private `DJANGO_SECRET_KEY`.
-   Configure `DJANGO_ALLOWED_HOSTS` for your deployment domain.
-   Configure static-file collection and serving.
-   Keep API keys and secrets out of version control.
-   Review upload validation, storage, access control, and rate limits.

## 👥 Team

**Team:** AIF013 Team\
**Project:** Sylva --- AI-Powered Document Intelligence Assistant\
**Event:** Hackathon project

Add your team members' names, roles, and profile links here.

## 📄 License

No license has been specified yet. Add a `LICENSE` file before
presenting this project as open source.

------------------------------------------------------------------------

Made with 🌿 to make document understanding simpler.
