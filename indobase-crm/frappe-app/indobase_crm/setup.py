from setuptools import find_packages, setup

setup(
	name="indobase_crm",
	version="0.1.0",
	description="Indobase CRM — Studio SSO for Frappe CRM",
	author="Indobase",
	license="AGPLv3",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
)
