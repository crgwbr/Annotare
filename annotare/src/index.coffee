Flakey = window.Flakey = require('flakey')
$ = window.$ = Flakey.$
ui = require('./lib/uikit')
Annotare = require('./controllers/annotare')


class App extends Flakey.controllers.Controller
  constructor: ->
    super
    @append Annotare
    
    @actions = {
      'click #logout-user': 'logout'
    }
  
  logout: (event) ->
    event.preventDefault()
    url = $(this).attr('data-href')
    ui.confirm('Are you sure?', 'Logging out will remove all data from this computer. It will be downloaded form the server next time you log in.').show (ok) ->
      if ok
        localStorage.clear()
        window.location.href = url


$(document).ready () ->
  settings = {
    container: $('#application')
    base_model_endpoint: '/api'
  }
  Flakey.init(settings)
  
  # Sync models
  Flakey.models.backend_controller.sync('Document')
  Flakey.models.backend_controller.sync('Annotation')
  Flakey.models.backend_controller.sync('File')
  
  annotare = window.Annotare = new App()
  annotare.make_active()


module.exports = App