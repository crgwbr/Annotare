# What's Annotare
Annotare is a personal digital notebook that *just works.&trade;*

## Try Annotare
A localStorage only version of Annotare is located at http://annotare.crgwbr.com/. There you can try out all the features of annotare without having to install or compile anything. Since it uses only localStorage as its only storage backend, you don't need to worry about your notes being read by anyone else.

## Getting Started
##### Users and Security
Annotare is designed to be run locally, for a single user. Because of that, authentication, users, and permissions don't actually exist. If, however, you wanted to install Annotare on a server, HTTPBasicAuth would be an effective means of security.

A more complete server with features like multiple users, data encryption, and a git-based backend is being planned, but for now the client-side app takes priority.

##### Getting up and running
*These instructions are written assuming you're running a sane operating system, such as Mac OS X or Linux, and that you're comfortable with a terminal. If you're running Windows and can't figure out how to make this work, please consider using OneNote instead.* 

##### Compiling form Source
Annotare is written in CoffeeScript and based on the [Flakey.js framework by Craig Weber][flakey]. The build system is based on CoffeeScript's included Cake build system. To compile from source, open a terminal in the root of this repo and run:

    cd annotare
    cake full_build
    
The Cakefile includes these tasks:

- **build_js**: Build the src/ directory into public/annotare.js
- **build_css**: Build css/ into public/annotare.css
- **minify_js**: Use Google's Closure compiler to minify public/annotare.js into public/annotare.min.js
- **full_build**: The same as running build_css, build_js, and minify_js
- **watch**: Watches src/ and css/ directories and re-compiles whenever a file changes.

##### Python Server
The Python server (tested with Python 2.7.2 on Mac OSX) is what serves the app to your browser and backs up your data. To make sure your system meets the required dependancies, from the project root directory, run:

    sudo pip install -r requirements.txt
    
Next, start the local server by running:

    cd annotare/server/
    chmod 755 manage.py
    ./manage.py startserver
    
This will start up Bottle's built in dev server on localhost:8888.  Head there in a web browser to start using Annotare.


[gruber]: http://daringfireball.net/
[md]: http://daringfireball.net/projects/markdown
[vim]: http://en.wikipedia.org/wiki/Vim_(text_editor)
[rands]: http://www.randsinrepose.com/archives/2007/11/11/the_nerd_handbook.html
[flakey]: http://flakeyjs.crgwbr.com