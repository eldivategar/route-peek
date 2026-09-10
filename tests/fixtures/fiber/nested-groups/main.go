package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()

	api := app.Group("/api")
	v1 := api.Group("/v1")
	v1.Get("/users", handler)
}
