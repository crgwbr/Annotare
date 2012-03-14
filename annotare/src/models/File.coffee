Flakey = require('flakey')

class File extends Flakey.models.Model
  @model_name: 'File'
  @fields: ['id', 'name', 'size', 'last_modified', 'mime', 'data', 'date_uploaded']

module.exports = File