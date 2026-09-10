package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()
	sub := fiber.New()

	sub.Get("/ping", pingHandler)

	// Sub-app mount
	app.Use("/api/sub", sub)

	// Middleware (must not be mounted as sub-app)
	app.Use("/api", authMiddleware)
}
