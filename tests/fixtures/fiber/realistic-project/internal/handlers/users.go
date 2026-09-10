package handlers

import "github.com/gofiber/fiber/v3"

func ListUsers(c fiber.Ctx) error { return c.SendStatus(200) }
func CreateUser(c fiber.Ctx) error { return c.SendStatus(201) }
func GetUser(c fiber.Ctx) error { return c.SendStatus(200) }
func UpdateUser(c fiber.Ctx) error { return c.SendStatus(200) }
func DeleteUser(c fiber.Ctx) error { return c.SendStatus(204) }
