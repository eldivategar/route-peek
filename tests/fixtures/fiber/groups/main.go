package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()

	api := app.Group("/api")
	api.Get("/users", handler)
	api.Post("/users", handler)
}
