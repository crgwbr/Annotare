Flakey = require('flakey')
$ = Flakey.$

autoresize = require('../lib/autoresize')
ui = require('../lib/uikit')
settings = require('../settings')
Document = require('../models/Document')


class Edit extends Flakey.controllers.Controller
  constructor: (config) ->
    @id = "edit-view"
    @class_name = "edit_document view"
    
    @actions = {
      'click .save': 'save'
      'click .discard': 'discard'
      'click .delete': 'delete_note'
      'keyup #editor': 'autosave'
    }
    
    super(config)
    @tmpl =  Flakey.templates.get_template('edit', require('../views/edit'))
    
  autosave: (event) =>
    event.preventDefault()
    localStorage[@autosave_key()] = $('#editor').val()
    
  autosave_key: () ->
    return "autosave-draft-#{@doc.id}";
  
  render: () =>
    if not @query_params.id
      return
      
    @doc = Document.get(@query_params.id)

    context = {
      doc: @doc
    }
    @html @tmpl.render(context)
    
    # Restore Draft?
    if localStorage[@autosave_key()]? and localStorage[@autosave_key()].length > 0
      ui.confirm('Restore?', 'An unsaved draft of this note was found. Would you like to restore it to the editor?').show (ok) =>
        if ok
          $('#editor').val(localStorage[@autosave_key()])
        else
          delete localStorage[@autosave_key()]
    
    # Make sure actions work
    @unbind_actions()
    @bind_actions()
    
    # Enable auto resizer
    $('#editor').autoResize({
      extraSpace: 100,
      maxHeight: 9000
    })
    
    # Drop Zone (jquery events dont work)
    dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('dragover', @drag_over, false);
    dropZone.addEventListener('drop', @drop_file, false);
  
  save: (event) =>
    event.preventDefault()
    @doc.base_text = $('#edit-editor').val()
    @doc.save()
    delete localStorage[@autosave_key()]
    ui.info('Everything\'s Shiny Capt\'n!', "\"#{ @doc.name }\" was successfully saved.").hide(settings.growl_hide_after).effect(settings.growl_effect)
    window.location.hash = "#/detail?" + Flakey.util.querystring.build(@query_params)
  
  discard: (event) =>
    event.preventDefault()
    ui.confirm('There be Monsters!', 'Careful there Captain; are you sure you want to discard all changes to this document?').show (ok) =>
      if ok
        delete localStorage[@autosave_key()]
        window.location.hash = "#/list"
        
  delete_note: (event) =>
    event.preventDefault()
    ui.confirm('There be Monsters!', 'Are you sure you want to delete this annotation?').show (ok) =>
      if ok
        id = $(event.target).parent().attr('data-id')
        @doc.delete_annotation(id)
        $(event.target).parent().slideUp()
        
  drop_file: (event) =>
    event.stopPropagation()
    event.preventDefault()

    files = event.dataTransfer.files; # FileList object.

    # files is a FileList of File objects. List some properties.
    output = ""
    for file in files
      output += "<li>#{escape(file.name)}</li>"
    
    $(".files ul").html output
        
  drag_over: (event) =>
    event.stopPropagation()
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy' # Explicitly show this is a copy.


module.exports = Edit