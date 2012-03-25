from django.db import models
from django.contrib.auth.models import User
from datetime import datetime
import calendar

from fields import JSONField

class FlakeyModel(models.Model):
    type = models.CharField(max_length=255)
    guid = models.CharField(max_length=255, unique=True)
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
    
    @classmethod
    def save(cls, model_type, owner, guid, versions):
        existing = cls.objects.filter(owner=owner, guid=guid)
        if existing.count():
            return cls.save_existing(existing[0], versions)
        else:
            return cls.save_new(model_type, owner, guid, versions)
    
    @classmethod
    def save_existing(cls, existing, versions):
        version_ids = map(lambda version: version['version_id'], versions)
        
        existing.versions.all().delete()
        
        for version in versions:
            FlakeyModelVersion.save(existing, version)
        
        return existing
    
    @classmethod
    def save_new(cls, model_type, owner, guid, versions):
        new = cls()
        new.type = model_type
        new.guid = guid
        new.owner = owner
        
        models.Model.save(new)
        for version in versions:
            FlakeyModelVersion.save(new, version)
        return new
    
    def __unicode__(self):
        return "%s - %s (%s)" % (self.type, self.guid, self.latest_change_stamp)


class FlakeyModelVersion(models.Model):
    parent = models.ForeignKey(FlakeyModel, related_name='versions')
    guid = models.CharField(max_length=255, unique=True)
    fields = JSONField()
    timestamp = models.IntegerField()
        
    def assemble(self):
        version = {
            'fields': self.fields,
            'version_id': self.guid,
            'time': self.timestamp,
        }
        return version
    
    @classmethod
    def save(cls, parent, data):
        ver = cls()
        ver.parent = parent
        ver.guid = data['version_id']
        ver.fields = data['fields']
        ver.timestamp = data['time']
        return models.Model.save(ver)
    
    def __unicode__(self):
        return "%s Version - %s" % (self.parent.type, self.guid)
