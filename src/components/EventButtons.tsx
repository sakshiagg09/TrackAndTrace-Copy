import React from "react";
import { Button, Stack } from "@mui/material";

interface Props {
  onEvent: (eventCode: string) => void;
}

const EventButtons: React.FC<Props> = ({ onEvent }) => {
  return (
    <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 2 }}>
      <Button variant="contained" color="primary" onClick={() => onEvent("DEPARTURE")}>
        Departure
      </Button>

      <Button variant="contained" color="secondary" onClick={() => onEvent("ARRIVAL")}>
        Arrival
      </Button>

      <Button variant="contained" color="success" onClick={() => onEvent("CHECKIN")}>
        Check-In
      </Button>

      <Button variant="contained" color="warning" onClick={() => onEvent("CHECKOUT")}>
        Check-Out
      </Button>
    </Stack>
  );
};

export default EventButtons;
