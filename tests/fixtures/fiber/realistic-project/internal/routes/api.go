package routes

import (
	"github.com/gofiber/fiber/v3"
)

func SetupRoutes(app *fiber.App) {
	api := app.Group("/api")

	SetupAuthRoutes(api)
	SetupUserRoutes(api)
	SetupHealthRoutes(app)
}
