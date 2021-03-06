Flakey = require('flakey')
$ = Flakey.$

autoresize = require('../lib/autoresize')
ui = require('../lib/uikit')
settings = require('../settings')
Document = require('../models/Document')


class NewDocument extends Flakey.controllers.Controller
  constructor: (config) ->
    @id = "new-document-view"
    @class_name = "new_document view"

    @actions = {
      # Normal Actions
      'click .new.save': 'save'
      'click .new.discard': 'discard'
      # Keyboard shortcuts
      'keyup esc #new-editor': 'discard'
      'keyup esc': 'discard'
      'keyup ctrl+s #new-editor': 'save'
      'keyup ctrl+s': 'save'
    }

    super(config)
    @tmpl =  Flakey.templates.get_template('new_document', require('../views/new_document'))

  render: ->
    # Render a template, replacing the 
    # controller's HTML
    @html @tmpl.render({
      title: @query_params.title
    })
    @unbind_actions()
    @bind_actions()
    
    $('#new-editor').autoResize({
      extraSpace: 100,
      maxHeight: 2000
    })
    $('#new-editor').blur()
    $('#name').focus()
    
  save: (event) =>
    event.preventDefault()
    name = $('#name').val()
    text = $('#new-editor').val()
    if name.length > 0 and text.length > 0
      doc = new Document {
        name: name
        base_text: text
      }
      doc.generate_slug()
      doc.save()
      ui.info('Everything\'s Shiny Capt\'n!', "\"#{ doc.name }\" was successfully saved.").hide(settings.growl_hide_after).effect(settings.growl_effect)
      window.location.hash = "#/detail?" + Flakey.util.querystring.build({id: doc.id})
    
  discard: (event) =>
    event.preventDefault()
    ui.confirm('There be Monsters!', 'Careful there Captain; are you sure you want to discard this document?').show (ok) ->
      if ok
        window.location.hash = "#/list"
    
    
module.exports = NewDocument