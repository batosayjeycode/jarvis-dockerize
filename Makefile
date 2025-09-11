update-backend-uat:
	cd backend && git checkout uat && git pull origin uat

update-frontend-uat:
	cd frontend && git checkout uat && git pull origin uat

update-backend-master:
	cd backend && git checkout master && git pull origin master

update-frontend-master:
	cd frontend && git checkout master && git pull origin master

dev: update-backend-uat update-frontend-uat
	docker-compose -f docker-compose.dev.yml up --build

prod: update-backend-master update-frontend-master
	docker-compose -f docker-compose.dev.yml up --build
