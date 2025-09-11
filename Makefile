update-backend-uat:
	cd backend && git checkout uat && git pull origin uat && rm -rf node_modules && npm install

update-frontend-uat:
	cd frontend && git checkout uat && git pull origin uat

update-backend-master:
	cd backend && git checkout users/andy/fixing-count-master && git pull origin master && rm -rf node_modules && npm install

update-frontend-master:
	cd frontend && git checkout master && git pull origin master

dev: update-backend-uat update-frontend-uat
	docker-compose -f docker-compose.dev.yml up --build

prod: update-backend-master update-frontend-master
	docker-compose -f docker-compose.dev.yml up --build

dev-new: update-backend-uat update-frontend-uat
	docker compose -f docker-compose.dev.yml up --build

prod-new: update-backend-master update-frontend-master
	docker compose -f docker-compose.dev.yml up --build
