import knex from "../db";
import { DBUser } from "src/models/dbUser";

export async function getUsersLocation(req, res) {
    const users : DBUser[] = await knex('users').whereNotNull('workplace_insee_code')
    res.json(users.map(u => ({
      workplace_insee_code: u.workplace_insee_code,
      username: u.username
    })))
}
  
export async function getMap(req, res) {
    res.render('map')
}