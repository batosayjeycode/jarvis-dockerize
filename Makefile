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
	git pull origin $(GIT_BRANCH)

update-workers-master:
	$(NVM) && \
	cd workers && \
	git checkout master && \
	git pull origin master && \
	nvm use $(NODE_BACKEND) && \
	rm -rf node_modules && \
	npm install && \
	npm install sociolla-core && \
	npm install metric-collector

sanctum: update-backend update-frontend update-workers-master
	docker-compose -f docker-compose.dev.yml up --build

sanctum-dev:
	docker-compose -f docker-compose.dev.yml up --build

sanctum-new: update-backend update-frontend update-workers-master
	docker compose -f docker-compose.dev.yml up --build

sanctum-new-dev:
	docker compose -f docker-compose.dev.yml up --build
