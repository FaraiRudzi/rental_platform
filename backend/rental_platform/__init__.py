from .celery import app as celery_app

__all__ = ("celery_app",)

# Windows without a C compiler: pip install PyMySQL, then uncomment these two lines.
# import pymysql
# pymysql.install_as_MySQLdb()
