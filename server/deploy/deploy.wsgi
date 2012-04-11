import os, sys
from django.core.handlers.wsgi import WSGIHandler

sys.stdout = sys.stderr

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
os.environ["DJANGO_SETTINGS_MODULE"] = "settings"

application = WSGIHandler()