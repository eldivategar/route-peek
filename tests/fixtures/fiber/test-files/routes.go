package main

import (
	"github.com/gofiber/fiber/v3"
)

func SetupProductionRoutes(app *fiber.App) {
	app.Get("/real", func(c fiber.Ctx) error {
		return c.SendString("real production route")
	})
}
