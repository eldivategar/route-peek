package main

import (
	"github.com/gofiber/fiber/v3"
	"example.com/realistic-fiber/internal/routes"
)

func main() {
	app := fiber.New()

	routes.SetupRoutes(app)
}
