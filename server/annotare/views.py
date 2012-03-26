# Create your views here.
from django.shortcuts import render_to_response
from django.template import RequestContext
from django.contrib.auth.decorators import login_required
from server import settings

@login_required
def index(request):
    return render_to_response('index.html', {'DEBUG': settings.DEBUG}, context_instance=RequestContext(request))