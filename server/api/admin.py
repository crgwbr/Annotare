from django.contrib import admin
from models import FlakeyModel, FlakeyModelVersion

admin.site.register(FlakeyModel)
admin.site.register(FlakeyModelVersion)
