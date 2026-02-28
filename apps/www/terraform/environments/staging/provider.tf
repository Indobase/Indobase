terraform {
  required_providers {
    digitalocean = {
      source = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
  cloud {
    organization = "Indobase"
    workspaces {
      name = "staging-homepage"
    }
  }
}

provider "digitalocean" {
  token = var.DO_TOKEN
}