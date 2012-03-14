Flakey = require('flakey')

Showdown = require('../lib/showdown')
Annotation = require('./Annotation')
File = require('./File')

class Document extends Flakey.models.Model
  @model_name: 'Document'
  @fields: ['id', 'name', 'slug', 'base_text', 'annotations', 'files']
  
  # Create a new highlght in this document
  annotate: (selection, html, attachment) ->
	  if attachment == undefined
	    type = 'highlight'
	  else
	    type = 'note'
    
    note = new Annotation {
      text: selection,
      type: type,
      attachment: attachment
      document: @id
    }
    note.save()
    
    if not @annotations or @annotations.constructor != Array
      @annotations = []
      
    @annotations.push note.id
    
    @save()
    return note.apply(html)
    
  attach_file: (raw_file, callback = undefined) ->
    if not @files or @files.constructor != Array
      @files = []
    reader = new FileReader()
    
    reader.onload = (event) =>
      mime = raw_file.type or "text/plain"
      
      data = (event.target.result + "")
      if data.slice(5, 11) == "base64"
        data = "data:text/plain;" + data.substr(5)
            
      file = new File {
        name: raw_file.fileName,
        size: raw_file.fileSize,
        last_modified: raw_file.lastModifiedDate,
        mime: mime,
        data: data,
        date_uploaded: new Date()
      }
      file.save()
      @files.push file.id
      @save()
      if callback
        callback(file)
      
    reader.readAsDataURL(raw_file)
    
  delete: () ->
    if @annotations?
      for note_id in @annotations
        note = Annotation.get(note_id)
        if note?
          note.delete()
    
    if @files?
      for file_id in @files
        file = File.get(file_id)
        if file?
          file.delete()
    
    super()
    
  delete_annotation: (id) ->
    index = @annotations.indexOf(id)
    if index != -1
      @annotations.splice(index, 1)
      @save()
      
  delete_file: (file_id) ->
    index = @files.indexOf(file_id)
    if index != -1
      @files.splice(index, 1)
      @save()
    
  # Draw annotations on document
  draw_annotations: (html, annotations = @annotations) ->
    if not annotations or annotations.constructor != Array
      annotations = []
    
    for note_id in annotations
      note = Annotation.get(note_id)
      if note?
        html = note.apply(html)
    return html
  
  # Generate the doc slug based on the name
  generate_slug: ->
    slug = @name
    slug = slug.toLowerCase().replace(/[^\_\ 0-9a-z-]/g, "").replace(/[ ]/g, '_')
    @slug = slug
    return slug
    
  get_files: ->
    if not @files or @files.constructor != Array
      @files = []
    files = []
    for id in @files
      file = File.get(id)
      if file?
        files.push(file)
    return files
    
  # get notes
  get_notes: ->
    if not @annotations or @annotations.constructor != Array
      @annotations = []
    notes = []
    for id in @annotations
      note = Annotation.get(id)
      if note?
        notes.push(note)
    return notes
    
  # Render document into HTML
  render: ->
    converter = new Showdown.converter()
    html = converter.makeHtml(@base_text)
    return html
  
module.exports = Document