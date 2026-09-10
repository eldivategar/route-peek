package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()

	app.Get("/users", handler)
	app.Post("/users", handler)
	app.Put("/users/:id", handler)
	app.Patch("/users/:id", handler)
	app.Delete("/users/:id", handler)
	app.Head("/users", handler)
	app.Options("/users", handler)
	app.Trace("/users", handler)
}
