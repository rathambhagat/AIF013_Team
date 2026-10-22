from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_view, name='home'),
    path('api/upload/', views.upload_document, name='api_upload'),
    path('api/ask/', views.ask_question, name='api_ask'),
]