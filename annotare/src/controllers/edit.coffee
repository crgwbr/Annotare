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
      # Normal Actions
      'click .edit.save': 'save'
      'click .edit.discard': 'discard'
      'click .edit.delete': 'delete_note'
      'click .edit.delete-file': 'delete_file'
      'keyup #edit-editor': 'autosave'
      # Keyboard shortcuts
      'keyup esc #edit-editor': 'discard'
      'keyup esc': 'discard'
      'keyup ctrl+s #edit-editor': 'save'
      'keyup ctrl+s': 'save'
    }
    
    super(config)
    @tmpl =  Flakey.templates.get_template('edit', require('../views/edit'))
    
  autosave: (event) =>
    event.preventDefault()
    if @doc.base_text != $('#edit-editor').val()
      localStorage[@autosave_key()] = $('#edit-editor').val()
    
  autosave_key: () ->
    return "autosave-draft-#{@doc.id}";
    
  close_editor: () ->
    delete localStorage[@autosave_key()]
    window.location.hash = "#/detail?" + Flakey.util.querystring.build {id: @doc.id}
  
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
          $('#edit-editor').val(localStorage[@autosave_key()])
        else
          delete localStorage[@autosave_key()]
    
    # Make sure actions work
    @unbind_actions()
    @bind_actions()
    
    # Enable auto resizer
    $('#edit-editor').autoResize({
      extraSpace: 100,
      maxHeight: 9000
    })
    
    $('#edit-editor').blur().focus()
    
    # Drop Zone (jquery events dont work)
    dropZone = document.getElementById('edit-drop-zone');
    dropZone.addEventListener('dragover', @drag_over, false);
    dropZone.addEventListener('drop', @drop_file, false);
  
  save: (event) =>
    event.preventDefault()
    @doc.base_text = $('#edit-editor').val()
    @doc.save()
    delete localStorage[@autosave_key()]
    ui.info('Everything\'s Shiny Capt\'n!', "\"#{ @doc.name }\" was successfully saved.").hide(settings.growl_hide_after).effect(settings.growl_effect)
  
  discard: (event) =>
    event.preventDefault()
    if @doc.base_text == $('#edit-editor').val()
      return @close_editor()
    
    ui.confirm('There be Monsters!', 'Careful there Captain; are you sure you want to discard all unsaved changes to this document?').show (ok) =>
      if ok
        @close_editor()
        
  delete_file: (event) =>
    event.preventDefault()
    event.preventDefault()
    ui.confirm('There be Monsters!', 'Are you sure you want to delete this annotation?').show (ok) =>
      if ok
        id = $(event.target).attr('data-id')
        @doc.delete_file(id)
        $(event.target).parent().slideUp()
        
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

    for file in files
      @doc.attach_file file, (file) =>
        $(".files ul").append "<li data-id='#{file.id}'><a href='#{file.data}' target='_blank'>#{file.name} (#{file.mime})</a>&nbsp;<a href='#' class='delete-file' data-id='#{file.id}'>[Delete]</a></li>"
        @unbind_actions()
        @bind_actions()
  
  drag_over: (event) =>
    event.stopPropagation()
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy' # Explicitly show this is a copy.


module.exports = Edit