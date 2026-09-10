package routes

import (
	"github.com/gofiber/fiber/v3"
	"example.com/realistic-fiber/internal/handlers"
)

func SetupUserRoutes(router fiber.Router) {
	users := router.Group("/users")

	users.Get("/", handlers.ListUsers)
	users.Post("/", handlers.CreateUser)
	users.Get("/:id", handlers.GetUser)
	users.Put("/:id", handlers.UpdateUser)
	users.Delete("/:id", handlers.DeleteUser)
}
