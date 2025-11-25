SHELL := /bin/bash
.ONESHELL:

NVM := source ~/.nvm/nvm.sh

NODE_BACKEND := 22.15.1
NODE_FRONTEND := 16.14.2


update-backend-uat:
	$(NVM) && \
	cd backend && \
	git checkout uat && \
	git pull origin uat && \
	nvm use $(NODE_BACKEND) && \
	rm -rf node_modules && \
	npm install && \
	npm install sociolla-core && \
	npm install metric-collector

update-frontend-uat:
	$(NVM) && \
	cd frontend && \
	git checkout uat && \
	git pull origin uat && \
	nvm use $(NODE_FRONTEND) && \
	rm -rf node_modules && \
	npm install

uat: update-backend-uat update-frontend-uat
	docker-compose -f docker-compose.dev.yml up --build

uat-dev:
	docker-compose -f docker-compose.dev.yml up --build

uat-new: update-backend-uat update-frontend-uat
	docker compose -f docker-compose.dev.yml up --build

uat-new-dev:
	docker compose -f docker-compose.dev.yml up --build
