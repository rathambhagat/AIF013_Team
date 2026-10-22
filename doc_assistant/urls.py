from django.urls import path
from . import views

urlpatterns = [
    # Pages
    path('',                  views.landing_view,   name='home'),
    path('workspace/',        views.workspace_view, name='workspace'),
    path('app/',              views.index_view,     name='app'),
    path('assistant/',        views.index_view,     name='assistant'),

    # Document upload APIs (supports both workspace.js and app.js)
    path('api/documents/upload/',       views.upload_document, name='api_upload_documents'),
    path('api/upload/',                 views.upload_document, name='api_upload'),

    # Document deletion API
    path('api/documents/<str:doc_id>/', views.delete_document, name='api_delete_doc'),

    # Question answering API
    path('api/ask/',                    views.ask_question,    name='api_ask'),
]