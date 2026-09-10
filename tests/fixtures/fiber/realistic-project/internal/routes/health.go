package routes

import (
	"github.com/gofiber/fiber/v3"
)

func SetupHealthRoutes(router fiber.Router) {
	health := router.Group("/health")

	health.Get("/", func(c fiber.Ctx) error {
		return c.SendString("ok")
	})
}
