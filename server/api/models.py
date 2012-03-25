from django.db import models
from django.contrib.auth.models import User
from django.contrib import admin

from fields import JSONField

class FlakeyModel(models.Model):
    type = models.CharField(max_length=255)
    guid = models.CharField(max_length=255)
    owner = models.ForeignKey(User, related_name='nodes')
    latest_change_stamp = models.DateTimeField(auto_now=True)
    
    def assemble(self):
        versions = []
        for version in self.versions.all():
            versions.append(version.assemble())
        
        doc = {
            'id': self.guid,
            'versions': versions,
        }
        return doc
    
    def __unicode__(self):
        return "%s - %s (%s)" % (self.type, self.guid, self.latest_change_stamp)


class FlakeyModelVersion(models.Model):
    parent = models.ForeignKey(FlakeyModel, related_name='versions')
    guid = models.CharField(max_length=255)
    fields = JSONField()
    timestamp = models.DateTimeField()
    latest_change_stamp = models.DateTimeField(auto_now=True)
    
    def assemble(self):
        version = {
            'field': self.fields,
            'version_id': self.guid,
            'time': self.timestamp,
        }
        return version
    
    def __unicode__(self):
        return "%s Version - %s (%s)" % (self.document.type, self.guid, self.latest_change_stamp)


#admin.site.register(FlakeyModel)
#admin.site.register(FlakeyModelVersion)
