package main

import (
	"github.com/gofiber/fiber/v3"
)

const apiPrefix = "/api"
const usersPath = "/users"

func main() {
	app := fiber.New()

	app.Get(apiPrefix+usersPath, handler)
}
