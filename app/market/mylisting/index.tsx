import React from "react";
import { Redirect } from "expo-router";

export default function MyListingRedirect() {
  return <Redirect href={{ pathname: "/market/listings", params: { mine: "1" } }} />;
}
