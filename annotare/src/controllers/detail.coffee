Flakey = require('flakey')
$ = Flakey.$

ui = require('../lib/uikit')
settings = require('../settings')
Document = require('../models/Document')
Annotation = require('../models/Annotation')


class Detail extends Flakey.controllers.Controller
  constructor: (config) ->
    @id = "detail-view"
    @class_name = "detail view"
    
    @actions = {
      'click .edit': 'edit'
      'click .highlighter': 'highlight'
      'click .annotate': 'annotate'
      'click .delete': 'delete'
      'click .delete-file': 'delete_file'
      'blur .note-detail': 'edit_note'
    }
    
    super(config)
    @tmpl =  Flakey.templates.get_template('detail', require('../views/detail'))
  
  render: () =>
    if not @query_params.id
      return
      
    # Render Document
    @doc = Document.get(@query_params.id)
    if not @doc?
      return
    
    context = {
      doc: @doc
    }
    @html @tmpl.render(context)
    @unbind_actions()
    @bind_actions()
    
    # Drop Zone (jquery events dont work)
    dropZone = document.getElementById('detail-drop-zone');
    dropZone.addEventListener('dragover', @drag_over, false);
    dropZone.addEventListener('drop', @drop_file, false);
    
  edit: (event) =>
    event.preventDefault()
    window.location.hash = "#/edit?" + Flakey.util.querystring.build(@query_params)
    
  edit_note: (event) =>
    event.preventDefault()
    target = $(event.target)
    id = target.attr('id').replace('note-detail-', '')
    content = target.html().replace(/\<br\/\>/, '\n\n').replace(/\<([\w\d\/]*)\>/g, ' ') # Strip HTML tags from content editable output
    note = Annotation.get(id)
    note.attachment = content
    note.type = "note"
    note.save()
    
  delete: (event) =>
    event.preventDefault()
    ui.confirm('Be careful!', 'Are you sure you want to delete this document?').show (ok) =>
      if ok
        @doc.delete()
        window.location.hash = "#/list"
    
  highlight: (event) =>
    event.preventDefault()
    selection = undefined
    if window.getSelection
      selection = window.getSelection()
    else if document.selection
      selection = document.selection.createRange()
    selection = selection.toString()
    
    if selection.length == 0
      ui.error('Well, you were right about this being a bad idea.', 'Please select some text first.').hide(settings.growl_hide_after).effect(settings.growl_effect)
    else
      # Save and Render highlight
      html = $("#detail-" + @doc.slug).html()
      html = @doc.annotate(selection, html)
      $("#detail-" + @doc.slug).html(html)
    
  annotate: (event) =>
    event.preventDefault()
    selection = undefined
    if window.getSelection
      selection = window.getSelection()
    else if document.selection
      selection = document.selection.createRange()
    selection = selection.toString()
    if selection.length == 0
      ui.error('Well, you were right about this being a bad idea.', 'Please select some text first.').hide(settings.growl_hide_after).effect(settings.growl_effect)
    else
      # Save and Render highlight
      html = $("#detail-" + @doc.slug).html()
      # Note modal
      options = {
        input: true,
        animate: true
      }
      html = @doc.annotate(selection, html, "Click here to edit this note.")
      $("#detail-" + @doc.slug).html(html)
      @unbind_actions()
      @bind_actions()
      
  delete_file: (event) =>
    event.preventDefault()
    event.preventDefault()
    ui.confirm('There be Monsters!', 'Are you sure you want to delete this annotation?').show (ok) =>
      if ok
        id = $(event.target).attr('data-id')
        @doc.delete_file(id)
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
    
    
module.exports = Detail