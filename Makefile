.PHONY: dev test build check-keys demo clean

dev:
	python server.py

test:
	pytest -v tests

build:
	cd web && npm run build

check-keys:
	python sentinelmind/check_keys.py

demo:
	python demo.py

clean:
	rm -rf .pytest_cache runs/*.json sentinelmind.sqlite3
