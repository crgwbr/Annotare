from django.conf.urls.defaults import *

from views import FlakeyHandler, Heartbeat

urlpatterns = patterns('',
    url(r'heartbeat/$', Heartbeat.as_view()),
    url(r'^(?P<model_type>[\w]+)/$', FlakeyHandler.as_view()),
    url(r'^(?P<model_type>[\w]+)/(?P<guid>.+)$', FlakeyHandler.as_view()),
)