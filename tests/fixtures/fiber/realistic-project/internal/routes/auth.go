package routes

import (
	"github.com/gofiber/fiber/v3"
	"example.com/realistic-fiber/internal/handlers"
)

func SetupAuthRoutes(router fiber.Router) {
	auth := router.Group("/auth")

	auth.Post("/login", handlers.Login)
	auth.Post("/register", handlers.Register)
	auth.Get("/profile", handlers.GetProfile)
}
