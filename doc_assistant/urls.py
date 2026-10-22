from django.urls import path
from doc_assistant import views

urlpatterns = [
    path("api/upload/", views.upload_document, name="upload_document"),
    path("api/ask/",    views.ask_question,    name="ask_question"),
]
