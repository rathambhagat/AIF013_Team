#!/usr/bin/env bash
set -o errexit

# Force pip to work inside Vercel's managed environment
pip install --upgrade pip --break-system-packages
pip install -r requirements.txt --break-system-packages

python manage.py collectstatic --no-input
python manage.py migrate