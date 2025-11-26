SHELL := /bin/bash
.ONESHELL:

NVM := source ~/.nvm/nvm.sh

NODE_BACKEND := 22.15.1
NODE_FRONTEND := 16.14.2
GIT_BRANCH := uat

update-backend:
	$(NVM) && \
	cd backend && \
	git checkout $(GIT_BRANCH) && \
	git pull origin $(GIT_BRANCH) && \
	nvm use $(NODE_BACKEND) && \
	rm -rf node_modules && \
	npm install && \
	npm install sociolla-core && \
	npm install metric-collector

update-frontend:
	$(NVM) && \
	cd frontend && \
	git checkout $(GIT_BRANCH) && \
	git pull origin $(GIT_BRANCH) && \
	nvm use $(NODE_FRONTEND) && \
	rm -rf node_modules && \
	npm install

jarvis: update-backend update-frontend
	docker-compose -f docker-compose.dev.yml up --build

jarvis-dev:
	docker-compose -f docker-compose.dev.yml up --build

jarvis-new: update-backend update-frontend
	docker compose -f docker-compose.dev.yml up --build

jarvis-new-dev:
	docker compose -f docker-compose.dev.yml up --build
