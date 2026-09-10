package main

import (
	"github.com/gofiber/fiber/v3"
	"example.com/cross-file/internal/routes"
)

func main() {
	app := fiber.New()
	api := app.Group("/api")

	routes.RegisterRoutes(api)
}
