from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse
from django.views.generic.base import View
from django.utils import simplejson as json
from django.utils.decorators import method_decorator

from models import FlakeyModel

class FlakeyHandler(View):
    @method_decorator(login_required)
    def dispatch(self, *args, **kwargs):
        # Filter models
        if not kwargs.has_key('model_type'):
            return self.error("No model_type given.")
            
        if kwargs['model_type'] not in ('Document', 'Annotation'):
            return self.error("Given model_type not allowed.")
        
        return super(FlakeyHandler, self).dispatch(*args, **kwargs)
        
    def error(self, errors, code=400):
        if not type(errors) == tuple and not type(errors) == list:
            errors = (errors, )
         
        error = {
            'status': 1,
            'errors': errors,
        }
        return HttpResponse(json.dumps(error), mimetype="application/json", status=code)
    
    def get(self, request, model_type, guid=None):
        if guid:
            results = self.get_one(request, model_type, guid)
        else:
            results = self.list(request, model_type)
        return HttpResponse(json.dumps(results))
    
    def get_one(self, request, model_type, guid):
        try:
            base = FlakeyModel.objects.get(owner=request.user, type=model_type, guid=guid)
        except FlakeyModel.DoesNotExist:
            raise Http404()
        return base.assemble()
    
    def list(self, request, model_type):
        base = FlakeyModel.objects.filter(owner=request.user, type=model_type)
        if base.count() == 0:
            raise Http404()
        
        results = []
        for model in base.all():
            results.append(model.assemble())
        
        return results
        
    def post(self, request, model_type, guid=None):
        return HttpResponse("POST")
    
    def delete(self, request, model_type, guid=None):
        return HttpResponse("DELETE")