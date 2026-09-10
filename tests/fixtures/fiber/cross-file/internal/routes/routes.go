package routes

import (
	"github.com/gofiber/fiber/v3"
)

func RegisterRoutes(router fiber.Router) {
	router.Get("/users", handler)
	router.Post("/users", handler)
}
