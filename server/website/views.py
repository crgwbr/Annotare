from django.http import HttpResponse
from django.shortcuts import render_to_response, redirect
from django.contrib import auth
from django.template import RequestContext
from django.conf import settings

def register(request):
    form = auth.forms.UserCreationForm()
    
    if request.method == "POST":
        form = auth.forms.UserCreationForm(request.POST)
        if form.is_valid():
            # Save User
            user = form.save()
            user.active = True
            user.save()
            # Log user in
            username = form.cleaned_data['username']
            password = form.cleaned_data['password1']
            user = auth.authenticate(username=username, password=password)
            if user is not None and user.is_active:
              auth.login(request, user)
              return redirect('annotare.views.index')
    
    context = {
      'form': form,
      'DEBUG': settings.DEBUG
    }
    return render_to_response('register.html', context, context_instance=RequestContext(request))