update-backend-uat:
	cd backend && git checkout uat && git pull origin uat && rm -rf node_modules && npm install

update-frontend-uat:
	cd frontend && git checkout uat && git pull origin uat

update-backend-master:
	cd backend && git checkout master && git pull origin master && rm -rf node_modules && npm install

update-frontend-master:
	cd frontend && git checkout master && git pull origin master

backend-uat:
	cd backend && git checkout uat && git pull origin uat

frontend-uat:
	cd frontend && git checkout uat && git pull origin uat

backend-master:
	cd backend && git checkout master && git pull origin master

frontend-master:
	cd frontend && git checkout master && git pull origin master

update-workers:
	cd workers && git checkout master && git pull origin master && rm -rf node_modules && npm install

workers:
	cd workers && git checkout master && git pull origin master

uat: update-backend-uat update-frontend-uat update-workers
	docker-compose -f docker-compose.dev.yml up --build

master: update-backend-master update-frontend-master update-workers
	docker-compose -f docker-compose.dev.yml up --build

uat-new: update-backend-uat update-frontend-uat update-workers
	docker compose -f docker-compose.dev.yml up --build

master-new: update-backend-master update-frontend-master update-workers
	docker compose -f docker-compose.dev.yml up --build

dev-uat: backend-uat frontend-uat workers
	docker-compose -f docker-compose.dev.yml up --build

dev-master: backend-master frontend-master workers
	docker-compose -f docker-compose.dev.yml up --build

dev-uat-new: backend-uat frontend-uat workers
	docker compose -f docker-compose.dev.yml up --build

dev-master-new: backend-master frontend-master workers
	docker compose -f docker-compose.dev.yml up --build

dev-now: 
	docker-compose -f docker-compose.dev.yml up --build
