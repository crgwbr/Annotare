Flakey = require('flakey')
$ = Flakey.$
settings = require('../settings')

class Main extends Flakey.controllers.Stack
  constructor: (config) ->
    NewDocument = require('./new_document')
    List = require('./list')
    Detail = require('./detail')
    Edit = require('./edit')
    History = require('./history')
    
    @id = 'main-stack'
    @class_name = 'stack'
    @controllers = {
      new_document: NewDocument
      list: List
      detail: Detail
      edit: Edit
      history: History
    }

    @routes = {
      '^/new$': 'new_document'
      '^/list$': 'list'
      '^/detail$': 'detail'
      '^/edit$': 'edit'
      '^/history$': 'history'
    }
    @default = '/list'
    
    @status = true;
    @sync_models()
    @check_heartbeat()
    
    super(config)
    
  check_heartbeat: () =>
    interval = 5000
    $.ajax {
      url: '/api/heartbeat/'
      success: (data) =>
        @server_online()
        setTimeout @check_heartbeat, interval
      error: (data) =>
        @server_offline()
        setTimeout @check_heartbeat, interval
    }
    
  server_online: () =>
    if not @status
      @sync_models()
    
    @status = true
    Flakey.events.trigger settings.signals.online, settings.signals.namespace
    $('#server_status').removeClass('offline').addClass('online').html('Server Online')
  
  server_offline: () =>
    @status = false
    Flakey.events.trigger settings.signals.offline, settings.signals.namespace
    $('#server_status').removeClass('online').addClass('offline').html('Server Offline')
    
  sync_models: () ->
    # Sync models
    Flakey.models.backend_controller.sync('Document')
    Flakey.models.backend_controller.sync('Annotation')

module.exports = Main
