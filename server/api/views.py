from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse
from django.views.generic.base import View
from django.utils import simplejson as json
from django.utils.decorators import method_decorator

from models import FlakeyModel
from settings import ALLOWED_MODELS

class FlakeyHandler(View):
    @method_decorator(login_required)
    def dispatch(self, *args, **kwargs):
        # Filter models
        if not kwargs.has_key('model_type'):
            return self.error("No model_type given.")
        
        if kwargs['model_type'] not in ALLOWED_MODELS:
            return self.error("Given model_type not allowed.")
        
        return super(FlakeyHandler, self).dispatch(*args, **kwargs)
    
    def error(self, errors, code=400):
        if not type(errors) == tuple and not type(errors) == list:
            errors = (errors, )
         
        error = {
            'status': 1,
            'errors': errors,
        }
        return self.render_response(error, status=code)
    
    def get(self, request, model_type, guid=None):
        if guid:
            results = self.get_one(request, model_type, guid)
        else:
            results = self.list(request, model_type)
        
        return self.render_response(results)
    
    def get_one(self, request, model_type, guid):
        try:
            base = FlakeyModel.objects.get(owner=request.user, type=model_type, guid=guid)
        except FlakeyModel.DoesNotExist:
            raise Http404()
        return base.assemble()
    
    def list(self, request, model_type):
        base = FlakeyModel.objects.filter(owner=request.user, type=model_type)
        results = []
        for model in base.all():
            results.append(model.assemble())
        return results
    
    def post(self, request, model_type, guid=None):
        if not guid:
            return self.error("Please provide a guid.")
        print request.POST['versions']
        versions = json.loads(request.POST['versions'])
        obj = FlakeyModel.save(model_type, request.user, guid, versions)
        return self.render_response(obj.assemble())
    
    def put(self, *args, **kwargs):
        return self.post(*args, **kwargs)
    
    def delete(self, request, model_type, guid=None):
        if not guid:
            return self.error("Please provide a guid.")
        
        try:
            base = FlakeyModel.objects.get(owner=request.user, type=model_type, guid=guid)
        except FlakeyModel.DoesNotExist:
            raise Http404()
        
        response = base.assemble()
        base.delete()
        return self.render_response(response)
    
    def render_response(self, data, status=200):
        return HttpResponse(json.dumps(data), mimetype="application/json", status=status)












