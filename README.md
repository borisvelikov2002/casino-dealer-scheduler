# Casino Dealer Scheduler

## Introduction

A web application for managing casino dealer schedules, including features for creating, editing, and assigning dealers to tables and shifts.

## Features

- Manage Dealers: Add, edit, and delete dealer information.
- Manage Tables: Add, edit, and delete table information.
- Manage Table Types: Define different types of tables.
- Schedule Generation: Automatically generate schedules based on dealer availability and table requirements.
- Schedule Viewing: View and edit generated schedules.
- User Permissions: Manage user access and permissions for different actions.

## Technologies Used

- Next.js: React framework for building the user interface.
- Supabase: Backend-as-a-Service for database and authentication.
- TypeScript: Programming language for type safety.
- Tailwind CSS: Utility-first CSS framework for styling.
- Shadcn/ui: Re-usable UI components.

---

## Getting Started

To get a local copy up and running, follow these simple steps:

### Prerequisites

* Node.js (version X.X.X or higher)
* npm (version X.X.X or higher)
* Supabase account and project

### Installation

1.  Clone the repo:
    ```sh
    git clone https://github.com/borisvelikov2002/casino-dealer-scheduler.git
    ```
2.  Navigate to the project directory:
    ```sh
    cd casino-dealer-scheduler
    ```
3.  Install NPM packages:
    ```sh
    npm install
    ```
4.  Set up your Supabase environment variables:
    - Create a `.env.local` file in the root of the project.
    - Add your Supabase URL and anon key:
      ```
      NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
      NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
      ```
5.  Run the development server:
    ```sh
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

Once the application is running, you can navigate through the different sections to manage dealers, tables, and schedules. The application provides an intuitive interface for all operations. Refer to the UI elements and navigation bar to explore different functionalities.

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## License

Distributed under the Apache License 2.0. See `LICENSE` for more information.
